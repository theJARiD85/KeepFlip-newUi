import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

import { APPWRITE, ID } from "../lib/appwrite";

type UploadedProfileImage = {
  $id: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
};

export async function uploadProfileImage(
  fileUri: string,
  fileName: string,
  fileMimeType: string
): Promise<UploadedProfileImage> {
  const imageFile = new File(fileUri);

  if (!imageFile.exists || imageFile.size <= 0) {
    throw new Error("KeepFlip could not access the selected profile photo.");
  }

  const fileId = ID.unique();

  const formData = new FormData();
  formData.append("fileId", fileId);
  formData.append("file", imageFile, fileName);

  const uploadUrl =
    `${APPWRITE.endpoint.replace(/\/$/, "")}` +
    `/storage/buckets/${encodeURIComponent(
      APPWRITE.profileImagesBucketId
    )}/files`;

  const response = await expoFetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": APPWRITE.projectId,
      Accept: "application/json",
    },
    body: formData,
  });

  const rawBody = await response.text();

  let payload: any = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Use the raw Appwrite response below if parsing fails.
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        rawBody ||
        `Profile photo upload failed with status ${response.status}.`
    );
  }

  if (!payload?.$id) {
    throw new Error("Appwrite did not return a profile-photo file ID.");
  }

  return payload as UploadedProfileImage;
}