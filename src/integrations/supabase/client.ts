
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://cvfqcvytoobplgracobg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZnFjdnl0b29icGxncmFjb2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwMTY4NjksImV4cCI6MjA1ODU5Mjg2OX0.k6ho8-LWVYgMAbmu2_pViojgJN51FoWdPREqD-p9htw";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Media file utilities
export const getMediaUrl = (projectId: string, type: 'video' | 'audio'): string => {
  const fileName = type === 'video' ? 'video.mp4' : 'audio.mp3';
  return `${SUPABASE_URL}/storage/v1/object/public/podcasts/${projectId}/${fileName}`;
};

export const checkMediaFileExists = async (projectId: string, type: 'video' | 'audio'): Promise<boolean> => {
  try {
    console.log(`Checking if ${type} file exists for project: ${projectId}`);
    const fileName = type === 'video' ? 'video.mp4' : 'audio.mp3';
    const path = `${projectId}/${fileName}`;
    
    // First, check if the file exists in the bucket using listFiles
    const { data: files, error: listError } = await supabase
      .storage
      .from('podcasts')
      .list(projectId);
    
    if (listError) {
      console.error(`Error listing files in project folder: ${listError.message}`);
      return false;
    }
    
    // Check if the file exists in the listing
    const fileExists = files?.some(file => file.name === fileName);
    
    if (!fileExists) {
      console.log(`${type} file not found in listing for project: ${projectId}`);
      return false;
    }
    
    // Get the public URL to check if it's accessible
    const { data } = await supabase
      .storage
      .from('podcasts')
      .getPublicUrl(path);
    
    if (!data || !data.publicUrl) {
      console.error(`No public URL found for ${type} file`);
      return false;
    }
    
    // Make a HEAD request to check if the file exists and is accessible
    const response = await fetch(data.publicUrl, { 
      method: 'HEAD',
      cache: 'no-store' // Prevent caching to ensure we get the latest status
    });
    
    console.log(`${type} file check result:`, {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      url: data.publicUrl
    });
    
    return response.ok;
  } catch (error) {
    console.error(`Error checking if ${type} file exists:`, error);
    return false;
  }
};

// Helper function to ensure the podcasts bucket exists
export const ensurePodcastsBucketExists = async (): Promise<boolean> => {
  try {
    // Check if the bucket exists
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();
      
    if (bucketsError) {
      console.error("Error checking buckets:", bucketsError);
      return false;
    }
    
    const podcastsBucketExists = buckets.some(bucket => bucket.name === 'podcasts');
    
    if (!podcastsBucketExists) {
      console.error("Podcasts bucket does not exist in buckets list:", buckets.map(b => b.name));
      return false;
    }
    
    // Verify we can actually access the bucket
    try {
      const { data: rootFiles, error: rootError } = await supabase
        .storage
        .from('podcasts')
        .list();
        
      if (rootError) {
        console.error("Error accessing podcasts bucket:", rootError);
        return false;
      }
      
      console.log("Successfully accessed podcasts bucket, found items:", rootFiles?.length || 0);
      return true;
    } catch (accessError) {
      console.error("Exception when accessing podcasts bucket:", accessError);
      return false;
    }
  } catch (error) {
    console.error("Error ensuring podcasts bucket exists:", error);
    return false;
  }
};

// Function to download media files directly
export const downloadMediaFile = async (projectId: string, type: 'video' | 'audio'): Promise<{ url: string, success: boolean, message?: string }> => {
  try {
    const fileName = type === 'video' ? 'video.mp4' : 'audio.mp3';
    const path = `${projectId}/${fileName}`;
    
    const { data, error } = await supabase
      .storage
      .from('podcasts')
      .download(path);
      
    if (error) {
      console.error(`Error downloading ${type} file:`, error);
      return { 
        url: getMediaUrl(projectId, type), 
        success: false, 
        message: `Error downloading ${type}: ${error.message}` 
      };
    }
    
    if (!data) {
      console.error(`No data returned when downloading ${type} file`);
      return { 
        url: getMediaUrl(projectId, type), 
        success: false, 
        message: `No data returned when downloading ${type} file` 
      };
    }
    
    // Create a blob URL for the downloaded file
    const blob = new Blob([data], { type: type === 'video' ? 'video/mp4' : 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    
    return { url: blobUrl, success: true };
  } catch (error) {
    console.error(`Error in downloadMediaFile for ${type}:`, error);
    return { 
      url: getMediaUrl(projectId, type), 
      success: false, 
      message: `Exception when downloading ${type}: ${error.message || 'Unknown error'}` 
    };
  }
};

// Function to delete media files
export const deleteMediaFile = async (projectId: string, type?: 'video' | 'audio'): Promise<boolean> => {
  try {
    // If no specific type is provided, delete both video and audio
    if (!type) {
      const { data, error } = await supabase
        .storage
        .from('podcasts')
        .remove([
          `${projectId}/video.mp4`, 
          `${projectId}/audio.mp3`
        ]);
        
      if (error) {
        console.error("Error deleting media files:", error);
        return false;
      }
      
      console.log("Successfully deleted media files:", data);
      return true;
    }
    
    // Delete specific file type
    const fileName = type === 'video' ? 'video.mp4' : 'audio.mp3';
    const { data, error } = await supabase
      .storage
      .from('podcasts')
      .remove([`${projectId}/${fileName}`]);
      
    if (error) {
      console.error(`Error deleting ${type} file:`, error);
      return false;
    }
    
    console.log(`Successfully deleted ${type} file:`, data);
    return true;
  } catch (error) {
    console.error(`Error in deleteMediaFile:`, error);
    return false;
  }
};
