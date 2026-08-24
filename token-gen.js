import crypto from 'crypto';

// 1. Generate 32 random bytes
const randomBytes = crypto.randomBytes(32);

// 2. Encode those 32 bytes into a Base64 string
const base64Token = randomBytes.toString('base64');

console.log("Your 32-Byte Base64 Token:");
console.log(base64Token);
