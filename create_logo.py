from PIL import Image, ImageDraw, ImageFont

# Create icon (1024x1024)
size = 1024
icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(icon)

# Professional gradient (Blue to Teal)
for y in range(size):
    r = int(41 + (0 - 41) * y / size)
    g = int(128 + (180 - 128) * y / size)
    b = int(185 + (220 - 185) * y / size)
    draw.rectangle([(0, y), (size, y+1)], fill=(r, g, b, 255))

# Rounded border
margin = 80
draw.rounded_rectangle([(margin, margin), (size-margin, size-margin)], radius=100, outline=(255, 255, 255, 255), width=12)

# Lightning bolt (Quick symbol)
bolt = [
    (size//2+50, size//4), 
    (size//2-30, size//2-20), 
    (size//2+20, size//2-20), 
    (size//2-50, size*3//4), 
    (size//2+30, size//2+20), 
    (size//2-20, size//2+20)
]
draw.polygon(bolt, fill=(255, 255, 255, 255))

# Text "SSM"
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 180)
    text = "SSM"
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(((size-(bbox[2]-bbox[0]))//2, size-250), text, fill=(255, 255, 255, 255), font=font)
except:
    pass

icon.save('src/icon.png')
print("✅ Icon created: src/icon.png")

# Create logo (1920x628)
logo = Image.new('RGBA', (1920, 628), (255, 255, 255, 0))
d = ImageDraw.Draw(logo)

# Gradient background
for y in range(628):
    r = int(41 + (0 - 41) * y / 628)
    g = int(128 + (180 - 128) * y / 628)
    b = int(185 + (220 - 185) * y / 628)
    d.rectangle([(0, y), (1920, y+1)], fill=(r, g, b, 255))

# Paste icon
icon_small = icon.resize((400, 400))
logo.paste(icon_small, (100, 114), icon_small)

# Text
try:
    f1 = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 200)
    f2 = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 80)
    d.text((600, 150), "QuickSSM", fill=(255, 255, 255, 255), font=f1)
    d.text((610, 400), "Fast AWS Session Manager", fill=(255, 255, 255, 200), font=f2)
except:
    pass

logo.save('src/logo.png')
print("✅ Logo created: src/logo.png")
print("\n🎨 Professional corporate design with elegant gradient")
print("📐 Icon: 1024x1024px | Logo: 1920x628px")
print("🎨 Colors: Blue (#2980B9) to Teal (#00B4DC)")
