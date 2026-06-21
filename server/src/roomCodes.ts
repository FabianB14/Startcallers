/** Maps short human-friendly room codes <-> Colyseus roomIds. */

// Avoid ambiguous chars (O/0, I/1) per spec §8.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

const codeToRoom = new Map<string, string>();

export function generateCode(): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  } while (codeToRoom.has(code));
  return code;
}

export function registerCode(code: string, roomId: string): void {
  codeToRoom.set(code, roomId);
}

export function releaseCode(code: string): void {
  codeToRoom.delete(code);
}

export function lookupRoom(code: string): string | undefined {
  return codeToRoom.get(code.toUpperCase());
}
