"""Minimal reader for The Witcher 3 .w3strings files (format as implemented by WolvenKit-7)."""
import struct, sys, json

MAGIC = {0x43975139: 0x79321793, 0x23863176: 0x75921975, 0x83496237: 0x73946816, 0x75886138: 0x42791159}

def read_bit6(f):
    result = shift = 0
    i = 1
    while True:
        b = f.read(1)[0]
        s, mask = 6, 255
        if b > 127:
            mask, s = 127, 7
        elif b > 63 and i == 1:
            mask = 63
        result |= (b & mask) << shift
        shift += s
        i += 1
        if b < 64 or (i >= 3 and b < 128):
            return result

def read(path):
    import io
    data = open(path, 'rb').read()
    f = io.BytesIO(data)
    assert f.read(4) == b'RTSW'
    version, = struct.unpack('<I', f.read(4))
    key1, = struct.unpack('<H', f.read(2))
    key2, = struct.unpack('<H', data[-2:])
    magic = MAGIC[(key1 << 16) | key2]
    n1 = read_bit6(f)
    block1 = []
    for _ in range(n1):
        idh, off, ln = struct.unpack('<III', f.read(12))
        block1.append((idh ^ magic, off, ln))
    n2 = read_bit6(f)
    keys = {}
    for _ in range(n2):
        keyhash, idn = struct.unpack('<II', f.read(8))
        keys[idn ^ magic] = keyhash
    n3 = read_bit6(f)
    start = f.tell()
    out = {}
    if version >= 164:
        # next-gen format: UTF-8 bytes, offsets/lengths in bytes, same per-element XOR schedule
        for sid, off, ln in block1:
            pos = start + off
            string_key = (magic >> 8) & 0xffff
            bs = bytearray()
            for i in range(ln):
                char_key = ((ln + 1) * string_key) & 0xffff
                bs.append(data[pos + i] ^ (char_key & 0xff))
                string_key = ((string_key << 1) | (string_key >> 15)) & 0xffff
            out[sid] = bs.decode('utf-8', errors='replace')
        return out, keys
    for sid, off, ln in block1:
        pos = start + off * 2
        string_key = (magic >> 8) & 0xffff
        chars = []
        for i in range(ln):
            b1, b2 = data[pos + 2 * i], data[pos + 2 * i + 1]
            char_key = ((ln + 1) * string_key) & 0xffff
            b1 ^= char_key & 0xff
            b2 ^= (char_key >> 8) & 0xff
            string_key = ((string_key << 1) | (string_key >> 15)) & 0xffff
            chars.append(b1 + (b2 << 8))
        out[sid] = bytes(struct.pack('<%dH' % len(chars), *chars)).decode('utf-16-le', errors='replace')
    return out, keys

if __name__ == '__main__':
    strings, keys = read(sys.argv[1])
    json.dump({str(k): v for k, v in strings.items()}, open(sys.argv[2], 'w'), ensure_ascii=False)
    print(len(strings), 'strings', len(keys), 'keys')
