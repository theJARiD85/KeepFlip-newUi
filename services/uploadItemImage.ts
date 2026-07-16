import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

import {
  APPWRITE,
  ID,
  Permission,
  Role,
} from "../lib/appwrite";

type UploadedAppwriteFile = {
  $id: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
};

export async function uploadItemImage(
  fileUri: string,
  fileName: string,
  fileMimeType: string,
  ownerId: string
): Promise<UploadedAppwriteFile> {
  const imageFile = new File(fileUri);

  console.log("[KeepFlip upload] Expo File check:", {
    uri: imageFile.uri,
    exists: imageFile.exists,
    size: imageFile.size,
    type: imageFile.type,
    name: imageFile.name,
  });

  if (!imageFile.exists || imageFile.size <= 0) {
    throw new Error("KeepFlip could not access the selected image file.");
  }

  const fileId = ID.unique();

  const formData = new FormData();

  formData.append("fileId", fileId);
  formData.append("file", imageFile, fileName);
  formData.append("permissions[]", Permission.read(Role.any()));
  formData.append("permissions[]", Permission.update(Role.user(ownerId)));
  formData.append("permissions[]", Permission.delete(Role.user(ownerId)));

  const uploadUrl =
    `${APPWRITE.endpoint.replace(/\/$/, "")}` +
    `/storage/buckets/${encodeURIComponent(APPWRITE.itemImagesBucketId)}/files`;

  console.log("[KeepFlip upload] Sending request:", {
    uploadUrl,
    fileId,
    fileName,
    fileMimeType,
  });

  const response = await expoFetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": APPWRITE.projectId,
      Accept: "application/json",
    },
    body: formData,
  });

  const rawBody = await response.text();

  console.log("[KeepFlip upload] Appwrite response:", {
    status: response.status,
    body: rawBody,
  });

  let payload: any = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Leave payload null and surface rawBody below.
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        rawBody ||
        `Appwrite image upload failed with status ${response.status}.`
    );
  }

  if (!payload?.$id) {
    throw new Error("Appwrite did not return an uploaded file ID.");
  }

  return payload as UploadedAppwriteFile;
}
