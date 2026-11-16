import struct
import zlib
import math

def create_png(width, height, draw_fn):
    # Generates a RGBA PNG
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter byte 0: None
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            raw_data.extend([r, g, b, a])
            
    compressed = zlib.compress(bytes(raw_data), 9)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png.extend(struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    
    # IDAT
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc))
    
    # IEND
    iend_crc = zlib.crc32(b'IEND')
    png.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc))
    
    return bytes(png)

def draw_lagos_icon(x, y, w, h):
    # Normalized coords from -1 to 1
    nx = (x / (w - 1)) * 2 - 1
    ny = (y / (h - 1)) * 2 - 1
    
    # Background: rounded squircle with Lagos blue #c3e2f7
    dist_sq = nx**4 + ny**4
    if dist_sq > 0.88:
        # Transparent outside
        return 0, 0, 0, 0
    
    # Subtle border
    if dist_sq > 0.82:
        return 165, 205, 235, 255
        
    # Inner circle (white card)
    dist_center = math.sqrt(nx*nx + ny*ny)
    if dist_center < 0.68:
        # Check if inside Crown
        # Crown coordinates roughly: ny in [-0.28, 0.32], nx in [-0.45, 0.45]
        # Base of crown: ny between 0.18 and 0.28, |nx| <= 0.35
        if 0.20 <= ny <= 0.27 and abs(nx) <= 0.34:
            # Gold base rim
            return 239, 178, 36, 255
        
        # Center jewel: circle at (0, 0.12)
        dj = math.sqrt(nx*nx + (ny - 0.12)**2)
        if dj < 0.065:
            # Emerald green jewel #23b574
            return 35, 181, 116, 255
            
        # Left and right white pearls
        dl = math.sqrt((nx + 0.22)**2 + (ny - 0.12)**2)
        dr = math.sqrt((nx - 0.22)**2 + (ny - 0.12)**2)
        if dl < 0.045 or dr < 0.045:
            return 255, 255, 255, 255
            
        # Crown body polygon logic:
        # Bottom: ny = 0.20
        # 3 Peaks: left (-0.38, -0.22), center (0, -0.32), right (0.38, -0.22)
        # 2 Valleys: left (-0.18, 0.02), right (0.18, 0.02)
        in_crown = False
        if -0.35 <= ny <= 0.20:
            # Check peaks
            # Peak balls:
            if math.sqrt((nx+0.36)**2 + (ny+0.22)**2) < 0.045 or \
               math.sqrt(nx**2 + (ny+0.32)**2) < 0.055 or \
               math.sqrt((nx-0.36)**2 + (ny+0.22)**2) < 0.045:
                return 255, 213, 79, 255
                
            # Check within crown envelope
            envelope_y = 0.20
            # Piecewise upper boundary
            if abs(nx) <= 0.18:
                # center spike: from (0, -0.32) down to (+-0.18, 0.02)
                top_y = -0.32 + (abs(nx) / 0.18) * 0.34
            elif abs(nx) <= 0.38:
                # outer spikes: from (+-0.18, 0.02) up to (+-0.36, -0.22)
                t = (abs(nx) - 0.18) / 0.18
                top_y = 0.02 - t * 0.24
            else:
                top_y = 1.0
                
            if ny >= top_y and abs(nx) <= 0.40 - (0.20 - ny)*0.2:
                in_crown = True
                
        if in_crown:
            # Gold gradient
            return 239, 178, 36, 255
            
        # White background card
        return 255, 255, 255, 255
        
    # Blue background
    return 195, 226, 247, 255

for size, filename in [
    (180, 'public/apple-touch-icon.png'),
    (192, 'public/pwa-192x192.png'),
    (512, 'public/pwa-512x512.png'),
    (512, 'public/pwa-maskable-512x512.png'),
]:
    png_bytes = create_png(size, size, draw_lagos_icon)
    with open(filename, 'wb') as f:
        f.write(png_bytes)
    print(f"Generated {filename} ({size}x{size})")
