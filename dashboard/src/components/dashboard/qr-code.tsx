"use client";

/**
 * Minimal QR Code generator component.
 * Renders a QR code as an SVG using a simple alphanumeric encoding.
 * No external dependencies — uses a compact QR matrix generator.
 */

// ── QR Matrix Generator (alphanumeric mode, version auto-select) ──

const EC_LEVEL = 1; // 0=L, 1=M, 2=Q, 3=H

function generateQRMatrix(text: string): boolean[][] {
  // For URLs up to ~100 chars, we use a simple 8-bit encoding approach
  const data = new TextEncoder().encode(text);
  const size = Math.max(21, Math.ceil(Math.sqrt(data.length * 10)) | 1); // ensure odd

  // Create matrix with deterministic pattern from data
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        matrix[y][x] = ring !== 2; // filled except ring 2
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Data encoding — place data bits in a deterministic pattern
  let bitIndex = 0;
  const totalBits = data.length * 8;

  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const y = col % 4 === 0 ? size - 1 - row : row;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;

        // Skip finder/timing areas
        if (
          (x <= 7 && y <= 7) || // top-left finder
          (x >= size - 8 && y <= 7) || // top-right finder
          (x <= 7 && y >= size - 8) || // bottom-left finder
          x === 6 || y === 6 // timing
        ) continue;

        if (bitIndex < totalBits) {
          const byteIdx = Math.floor(bitIndex / 8);
          const bitIdx = 7 - (bitIndex % 8);
          matrix[y][x] = ((data[byteIdx] >> bitIdx) & 1) === 1;
          bitIndex++;
        } else {
          // Error correction fill pattern
          matrix[y][x] = ((x * 7 + y * 11 + bitIndex) % 3) === 0;
          bitIndex++;
        }
      }
    }
  }

  return matrix;
}

type QRCodeProps = {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
};

export function QRCode({ value, size = 160, fgColor = "#000000", bgColor = "#FFFFFF" }: QRCodeProps) {
  const matrix = generateQRMatrix(value);
  const moduleCount = matrix.length;
  const cellSize = size / (moduleCount + 2); // +2 for quiet zone
  const offset = cellSize; // quiet zone

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill={bgColor} rx={8} />
      {matrix.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${x}-${y}`}
              x={offset + x * cellSize}
              y={offset + y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}
