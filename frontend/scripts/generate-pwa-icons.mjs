import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function createSolidPng(size, rgba) {
  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 4
      raw[i] = rgba.r
      raw[i + 1] = rgba.g
      raw[i + 2] = rgba.b
      raw[i + 3] = rgba.a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(6, 9)
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  const idat = deflateSync(raw)
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function ensurePwaPngIcons(iconsDirAbs) {
  const icon192Abs = resolve(iconsDirAbs, 'icon-192.png')
  const icon512Abs = resolve(iconsDirAbs, 'icon-512.png')

  if (!existsSync(iconsDirAbs)) mkdirSync(iconsDirAbs, { recursive: true })

  const bg = { r: 31, g: 31, b: 38, a: 255 }
  if (!existsSync(icon192Abs)) writeFileSync(icon192Abs, createSolidPng(192, bg))
  if (!existsSync(icon512Abs)) writeFileSync(icon512Abs, createSolidPng(512, bg))
}

const __dirname = dirname(fileURLToPath(import.meta.url))
ensurePwaPngIcons(resolve(__dirname, '..', 'public', 'icons'))

