import struct, os

def decompress_szdd(data):
    """Correct SZDD decompression per cabextract.org spec"""
    if data[0:4] != b'SZDD':
        raise Exception('Not SZDD')
    
    uncompressed = struct.unpack_from('<I', data, 0x0A)[0]
    print(f'  Uncompressed size: {uncompressed}')
    
    N = 4096
    window = bytearray([0x20] * N)  # initialized to spaces
    pos = N - 16  # = 4080
    out = bytearray()
    idx = 14  # data starts after 14-byte header
    
    while idx < len(data) and len(out) < uncompressed:
        control = data[idx]; idx += 1
        cbit = 0x01
        while cbit & 0xFF:
            if len(out) >= uncompressed:
                break
            if control & cbit:
                # LITERAL
                b = data[idx]; idx += 1
                window[pos] = b
                out.append(b)
                pos = (pos + 1) & 4095
            else:
                # MATCH
                lo = data[idx]; hi = data[idx+1]; idx += 2
                matchpos = lo | ((hi & 0xF0) << 4)
                matchlen = (hi & 0x0F) + 3
                for _ in range(matchlen):
                    if len(out) >= uncompressed:
                        break
                    b = window[matchpos]
                    window[pos] = b
                    out.append(b)
                    pos = (pos + 1) & 4095
                    matchpos = (matchpos + 1) & 4095
            cbit <<= 1
    
    return bytes(out[:uncompressed])

src_dir = r'E:\2.ติดตั้งระบบโปรแกรม'
out_dir = r'D:\StokIT\temp_mdb'
os.makedirs(out_dir, exist_ok=True)

for fname in ['maindata.md_', 'ReportData.md_', 'adddisplay.md_']:
    src = os.path.join(src_dir, fname)
    dst = os.path.join(out_dir, fname.replace('.md_', '.mdb'))
    print(f'\nDecompressing {fname}...')
    with open(src, 'rb') as f:
        data = f.read()
    print(f'  Compressed: {len(data)} bytes')
    
    mdb = decompress_szdd(data)
    with open(dst, 'wb') as f:
        f.write(mdb)
    print(f'  Decompressed: {len(mdb)} bytes')
    print(f'  Header first 16 bytes: {list(mdb[:16])}')
    print(f'  Header hex: {mdb[:32].hex()}')
