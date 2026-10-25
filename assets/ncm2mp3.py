# NCM -> MP3 本地解密（网易云音乐缓存格式，算法公开，纯本地转换）
import struct, base64, json, sys
from Crypto.Cipher import AES

CORE_KEY = b'hzHRAmso5kInbaxW'
META_KEY = b'#14ljk_!\\]0'

def unpad(data):
    return data[:-data[-1]] if 1 <= data[-1] <= 16 else data

def decrypt(src, dst):
    f = open(src, 'rb')
    if f.read(8) != b'CTENFDAM':
        raise SystemExit('not ncm')
    f.read(2)  # 跳过 2 字节 gap
    # 密钥
    klen = struct.unpack('<I', f.read(4))[0]
    if klen & 0x80000000:            # 旧版格式：带高位标志
        klen ^= 0x80000000
    kdata = bytearray(f.read(klen))
    for i in range(len(kdata)):
        kdata[i] ^= 0x64
    cipher = AES.new(CORE_KEY, AES.MODE_ECB)
    key = unpad(cipher.decrypt(bytes(kdata)))[17:]
    # 元信息（歌名/歌手，可选）
    mlen = struct.unpack('<I', f.read(4))[0]
    if mlen & 0x80000000:
        mlen ^= 0x80000000
    if mlen:
        mdata = bytearray(f.read(mlen))
        for i in range(1, len(mdata)):
            mdata[i] ^= 0x63
        try:
            meta = json.loads(base64.b64decode(bytes(mdata[22:])))
            print('song:', meta.get('musicName'), '-', ','.join(a[0] for a in meta.get('artist', [])), '| format:', meta.get('format'))
            fmt = meta.get('format', 'mp3')
        except Exception:
            fmt = 'mp3'
    else:
        fmt = 'mp3'
    f.seek(4, 1)      # crc
    f.seek(5, 1)      # gap
    ilen = struct.unpack('<I', f.read(4))[0]
    f.seek(ilen, 1)   # 跳过封面图
    # 音频数据：RC 变体流解密
    audio = f.read()
    box = list(range(256))
    c = 0
    for i in range(256):
        c = (box[i] + c + key[i % len(key)]) & 0xff
        box[i], box[c] = box[c], box[i]
    out = bytearray(len(audio))
    for i in range(len(audio)):
        j = (i + 1) & 0xff
        out[i] = audio[i] ^ box[(box[j] + box[(box[j] + j) & 0xff]) & 0xff]
    open(dst, 'wb').write(out)
    print('saved:', dst, len(out), 'bytes')

if __name__ == '__main__':
    decrypt(sys.argv[1], sys.argv[2])
