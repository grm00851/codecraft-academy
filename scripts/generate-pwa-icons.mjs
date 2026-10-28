import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const iconDirectory = 'public/icons'
mkdirSync(iconDirectory, { recursive: true })

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const content = Buffer.concat([typeBytes, data])
  const header = Buffer.alloc(4)
  header.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(content))
  return Buffer.concat([header, content, checksum])
}

function createIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size)
  const center = (size - 1) / 2
  const radius = size * 0.2
  const cX = center
  const cY = size * 0.49
  const outer = size * 0.29
  const inner = size * 0.155

  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    pixels[row] = 0
    for (let x = 0; x < size; x++) {
      const dxBox = Math.max(Math.abs(x - center) - (size / 2 - radius), 0)
      const dyBox = Math.max(Math.abs(y - center) - (size / 2 - radius), 0)
      const offset = row + 1 + x * 4
      if (dxBox * dxBox + dyBox * dyBox > radius * radius) continue

      const blend = (x + y) / (2 * size)
      let red = Math.round(145 - 60 * blend)
      let green = Math.round(118 - 62 * blend)
      let blue = Math.round(255 - 49 * blend)
      const dx = x - cX
      const dy = y - cY
      const distance = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const openRight = angle > -0.63 && angle < 0.63
      if (distance >= inner && distance <= outer && !openRight) [red, green, blue] = [255, 255, 255]
      pixels[offset] = red
      pixels[offset + 1] = green
      pixels[offset + 2] = blue
      pixels[offset + 3] = 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(`${iconDirectory}/icon-${size}.png`, createIcon(size))
}
