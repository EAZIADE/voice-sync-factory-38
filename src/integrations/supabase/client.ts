
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://cvfqcvytoobplgracobg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZnFjdnl0b29icGxncmFjb2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwMTY4NjksImV4cCI6MjA1ODU5Mjg2OX0.k6ho8-LWVYgMAbmu2_pViojgJN51FoWdPREqD-p9htw";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
    },
  },
});

// Storage bucket helpers for podcast media files
export const ensurePodcastsBucketExists = async (): Promise<boolean> => {
  try {
    // Check if the bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const podcastsBucket = buckets?.find(bucket => bucket.name === 'podcasts');
    
    if (!podcastsBucket) {
      // Create the bucket if it doesn't exist
      const { error } = await supabase.storage.createBucket('podcasts', {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024 // 100MB limit
      });
      
      if (error) {
        console.error('Error creating podcasts bucket:', error);
        return false;
      }
    } else {
      // Make sure the bucket is public
      const { error } = await supabase.storage.updateBucket('podcasts', {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024 // 100MB limit
      });
      
      if (error) {
        console.error('Error updating podcasts bucket:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring podcasts bucket exists:', error);
    return false;
  }
};

export const getMediaUrl = (projectId: string, fileType: 'audio' | 'video'): string => {
  const extension = fileType === 'audio' ? 'mp3' : 'mp4';
  const path = `${projectId}/${fileType}.${extension}`;
  
  // Force no caching with a unique timestamp for each request
  const timestamp = new Date().getTime();
  const { data } = supabase.storage.from('podcasts').getPublicUrl(`${path}?t=${timestamp}`);
  
  // Add cache-busting query parameter
  const url = new URL(data.publicUrl);
  url.searchParams.set('t', timestamp.toString());
  
  // Return the sanitized URL
  return url.toString();
};

export const checkMediaFileExists = async (projectId: string, fileType: 'audio' | 'video'): Promise<boolean> => {
  try {
    const extension = fileType === 'audio' ? 'mp3' : 'mp4';
    const path = `${projectId}/${fileType}.${extension}`;
    
    // First attempt to list files in the specific project directory
    const { data, error } = await supabase.storage.from('podcasts').list(projectId, {
      limit: 10,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });
    
    if (error) {
      console.error(`Error checking if ${fileType} file exists:`, error);
      
      // Try a direct head request to see if the file exists
      try {
        const mediaUrl = getMediaUrl(projectId, fileType);
        const response = await fetch(mediaUrl, { 
          method: 'HEAD',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        return response.ok;
      } catch (headError) {
        console.error(`Error checking file with HEAD request:`, headError);
      }
      
      return false;
    }
    
    return data ? data.some(file => file.name === `${fileType}.${extension}`) : false;
  } catch (error) {
    console.error(`Error checking if ${fileType} file exists:`, error);
    return false;
  }
};

export const downloadMediaFile = async (projectId: string, fileType: 'audio' | 'video'): Promise<{success: boolean, url: string, message?: string}> => {
  try {
    // First make sure we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await refreshSession();
    }
    
    const extension = fileType === 'audio' ? 'mp3' : 'mp4';
    const path = `${projectId}/${fileType}.${extension}`;
    
    // Ensure the bucket exists
    await ensurePodcastsBucketExists();
    
    // Get the direct download URL
    const mediaUrl = getMediaUrl(projectId, fileType);
    
    // Try a HEAD request first to validate the URL
    try {
      const headResponse = await fetch(mediaUrl, { 
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (headResponse.ok) {
        return {
          success: true,
          url: mediaUrl,
          message: 'Direct download URL available'
        };
      }
    } catch (headError) {
      console.warn("HEAD request to media URL failed:", headError);
    }
    
    // If direct URL didn't work, try direct download
    const { data, error } = await supabase.storage.from('podcasts').download(path);
    
    if (error) {
      throw error;
    }
    
    const url = URL.createObjectURL(data);
    
    return {
      success: true,
      url,
      message: 'Download successful'
    };
  } catch (error) {
    console.error(`Error downloading ${fileType} file:`, error);
    return {
      success: false,
      url: '',
      message: `Failed to download ${fileType} file: ${error.message || 'Unknown error'}`
    };
  }
};

export const deleteMediaFile = async (projectId: string): Promise<{success: boolean, message?: string}> => {
  try {
    // Check if session exists
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        return {
          success: false,
          message: 'Authentication required to delete media files'
        };
      }
    }
    
    // Delete both audio and video files
    const { error: audioError } = await supabase.storage
      .from('podcasts')
      .remove([`${projectId}/audio.mp3`]);
      
    if (audioError) {
      console.warn('Warning: Could not delete audio file:', audioError);
    }
    
    const { error: videoError } = await supabase.storage
      .from('podcasts')
      .remove([`${projectId}/video.mp4`]);
      
    if (videoError) {
      console.warn('Warning: Could not delete video file:', videoError);
    }
    
    return { 
      success: true,
      message: 'Media files deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting media files:', error);
    return {
      success: false,
      message: `Failed to delete media files: ${error.message || 'Unknown error'}`
    };
  }
};

// Helper function to check if a user's session is valid
export const isSessionValid = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      return false;
    }
    
    // Also check if the session is expired or close to expiry
    const expiresAt = data.session.expires_at;
    if (expiresAt) {
      const expiryTime = new Date(expiresAt * 1000);
      const now = new Date();
      // If session expires in less than 5 minutes, consider it invalid
      if (expiryTime.getTime() - now.getTime() < 5 * 60 * 1000) {
        console.log("Session is about to expire, refreshing");
        return await refreshSession();
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking session validity:', error);
    return false;
  }
};

// Force refresh the auth token
export const refreshSession = async (): Promise<boolean> => {
  try {
    console.log("Attempting to refresh Supabase session");
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error || !data.session) {
      console.error('Failed to refresh session:', error);
      return false;
    }
    
    console.log("Successfully refreshed session, new expiry:", 
      data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : "unknown");
    
    return true;
  } catch (error) {
    console.error('Error refreshing session:', error);
    return false;
  }
};

// Format validation checker for media files
export const validateMediaFile = async (url: string, type: 'audio' | 'video'): Promise<boolean> => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.error(`${type} file not accessible:`, response.status);
      return false;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType) {
      console.error(`No content-type for ${type} file`);
      return false;
    }
    
    // Broader content type checking to handle different server responses
    if (type === 'audio' && 
        !(contentType.includes('audio/') || 
          contentType.includes('application/octet-stream') || 
          contentType.includes('binary'))) {
      console.error(`Invalid content type for audio: ${contentType}`);
      return false;
    }
    
    if (type === 'video' && 
        !(contentType.includes('video/') || 
          contentType.includes('application/octet-stream') || 
          contentType.includes('binary'))) {
      console.error(`Invalid content type for video: ${contentType}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error validating ${type} file:`, error);
    return false;
  }
};

// Function to get a signed URL for enhanced media access
export const getSignedUrl = async (projectId: string, fileType: 'audio' | 'video'): Promise<string | null> => {
  try {
    const extension = fileType === 'audio' ? 'mp3' : 'mp4';
    const path = `${projectId}/${fileType}.${extension}`;
    
    const { data, error } = await supabase.storage
      .from('podcasts')
      .createSignedUrl(path, 60); // 60 seconds validity
      
    if (error) {
      console.error(`Error creating signed URL for ${fileType}:`, error);
      return null;
    }
    
    return data.signedUrl;
  } catch (error) {
    console.error(`Error getting signed URL for ${fileType}:`, error);
    return null;
  }
};

// Direct media blob download function
export const downloadMediaBlob = async (projectId: string, fileType: 'audio' | 'video'): Promise<Blob | null> => {
  try {
    const extension = fileType === 'audio' ? 'mp3' : 'mp4';
    const path = `${projectId}/${fileType}.${extension}`;
    
    const { data, error } = await supabase.storage
      .from('podcasts')
      .download(path);
      
    if (error) {
      console.error(`Error downloading ${fileType} blob:`, error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Error downloading ${fileType} blob:`, error);
    return null;
  }
};
