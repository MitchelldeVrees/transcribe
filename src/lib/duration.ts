// src/lib/duration.ts
export function parseAudioLengthToMs(s: string): number {
    if (!s) return 0;
    const parts = s.trim().split(':').map(p => p.trim());
    if (parts.some(p => p === '' || Number.isNaN(Number(p)))) return 0;
  
    let h = 0, m = 0, sec = 0;
    if (parts.length === 3) {
      [h, m, sec] = parts.map(n => Math.max(0, parseInt(n, 10)));
    } else if (parts.length === 2) {
      [m, sec] = parts.map(n => Math.max(0, parseInt(n, 10)));
    } else if (parts.length === 1) {
      sec = Math.max(0, parseInt(parts[0], 10));
    } else {
      return 0;
    }
  
    if (m >= 60 || sec >= 60) {
      // tolerate inputs like "90:10" by normalizing
      const totalSec = h * 3600 + m * 60 + sec;
      return totalSec * 1000;
    }
    return ((h * 3600) + (m * 60) + sec) * 1000;
  }
  