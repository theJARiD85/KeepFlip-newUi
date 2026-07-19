import { Functions, ExecutionMethod } from 'react-native-appwrite';
import { appwriteClient } from './appwrite-client';

const functions = new Functions(appwriteClient);

// IMPORTANT: Define this in your .env / constants once the function is deployed!
const PHOTOGRAMMETRY_FUNCTION_ID = process.env.EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_FUNCTION_ID || 'photogrammetry-api';

export interface PhotogrammetryJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  modelUrl?: string; // URL to the generated .gltf / .glb / .obj file
}

export const PhotogrammetryAPI = {
  /**
   * Upload a sequence of images to Appwrite Storage, then trigger the Photogrammetry Function.
   */
  async uploadImageSequence(imageUris: string[]): Promise<string> {
    console.log(`[Photogrammetry API] Uploading ${imageUris.length} images...`);
    
    // In production, we would upload these URIs to Appwrite Storage first and get fileIds.
    // For now, we simulate passing them directly.
    const fileIds = ['simulated_file_1', 'simulated_file_2'];
    
    try {
      const execution = await functions.createExecution(
        PHOTOGRAMMETRY_FUNCTION_ID,
        JSON.stringify({
          action: 'create_job',
          fileIds: fileIds
        }),
        false, // async execution
        '/',
        ExecutionMethod.POST
      );

      const response = JSON.parse(execution.responseBody);
      if (!response.success) throw new Error(response.message);
      
      return response.jobId;
    } catch (error) {
      console.error('[Photogrammetry API] Job Creation Failed', error);
      throw error;
    }
  },

  /**
   * Poll the Appwrite function for job status.
   */
  async getJobStatus(jobId: string): Promise<PhotogrammetryJob> {
    console.log(`[Photogrammetry API] Checking status for job ${jobId}...`);
    
    try {
      const execution = await functions.createExecution(
        PHOTOGRAMMETRY_FUNCTION_ID,
        JSON.stringify({
          action: 'check_status',
          jobId: jobId
        }),
        false, 
        '/',
        ExecutionMethod.POST
      );

      const response = JSON.parse(execution.responseBody);
      if (!response.success) throw new Error(response.message);
      
      return {
        id: response.jobId,
        status: response.status,
        progress: response.progress,
        modelUrl: response.modelUrl
      };
    } catch (error) {
      console.error('[Photogrammetry API] Status Check Failed', error);
      throw error;
    }
  }
};
