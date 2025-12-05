from PIL import Image, ImageDraw, ImageFont

# Create icon (1024x1024) - Dark theme friendly with transparent background
icon_size = 1024
icon = Image.new('RGBA', (icon_size, icon_size), color=(0, 0, 0, 0))
draw_icon = ImageDraw.Draw(icon)

# Modern circular background with orange gradient
center = icon_size // 2
radius = int(icon_size * 0.45)

# Create radial gradient effect (Orange to amber)
for i in range(radius, 0, -1):
    alpha = int(255 * (i / radius) * 0.95)
    color_factor = i / radius
    r = int(255 * color_factor)
    g = int(165 + (90 * (1 - color_factor)))
    b = int(0 + (50 * (1 - color_factor)))
    draw_icon.ellipse(
        [(center - i, center - i), (center + i, center + i)],
        fill=(r, g, b, alpha)
    )

# Draw modern terminal/console symbol
terminal_color = (255, 255, 255, 255)
terminal_size = int(icon_size * 0.5)
terminal_x = (icon_size - terminal_size) // 2
terminal_y = int(icon_size * 0.3)

# Terminal prompt symbol ">"
prompt_size = int(icon_size * 0.25)
prompt_x = terminal_x + int(terminal_size * 0.15)
prompt_y = terminal_y + int(terminal_size * 0.25)
draw_icon.polygon([
    (prompt_x, prompt_y),
    (prompt_x + prompt_size, prompt_y + prompt_size // 2),
    (prompt_x, prompt_y + prompt_size)
], fill=terminal_color)

# Cursor line
cursor_x = prompt_x + prompt_size + int(icon_size * 0.05)
cursor_y = prompt_y + int(prompt_size * 0.15)
cursor_height = int(prompt_size * 0.7)
line_width = int(icon_size * 0.02)
draw_icon.rectangle([
    (cursor_x, cursor_y),
    (cursor_x + line_width * 2, cursor_y + cursor_height)
], fill=terminal_color)

icon.save('src/icon.png')
print("✅ Icon created: src/icon.png")

# Create logo (1920x628) - TRANSPARENT background for dark theme
logo_width = 1920
logo_height = 628
logo = Image.new('RGBA', (logo_width, logo_height), color=(0, 0, 0, 0))
draw_logo = ImageDraw.Draw(logo)

# Draw icon on the left
icon_small = icon.resize((int(logo_height * 0.8), int(logo_height * 0.8)))
icon_x = int(logo_width * 0.08)
icon_y = int(logo_height * 0.1)
logo.paste(icon_small, (icon_x, icon_y), icon_small)

# Add "QuickSSM" text
try:
    title_font = ImageFont.truetype("/System/Library/Fonts/SF-Pro-Display-Bold.otf", 200)
except:
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 200)
    except:
        title_font = ImageFont.load_default()

try:
    subtitle_font = ImageFont.truetype("/System/Library/Fonts/SF-Pro-Display-Regular.otf", 65)
except:
    try:
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 65)
    except:
        subtitle_font = ImageFont.load_default()

title = "QuickSSM"
subtitle = "Fast AWS Session Manager"

# Draw title with orange color
title_x = int(logo_width * 0.35)
title_y = int(logo_height * 0.25)
draw_logo.text((title_x, title_y), title, font=title_font, fill=(255, 165, 0, 255))

# Draw subtitle in light gray
subtitle_x = title_x
subtitle_y = title_y + 220
draw_logo.text((subtitle_x, subtitle_y), subtitle, font=subtitle_font, fill=(180, 180, 180, 255))

logo.save('src/logo.png')
print("✅ Logo created: src/logo.png")

print("\n🎨 Modern dark-theme friendly design with TRANSPARENT background")
print("📐 Icon: 1024x1024px | Logo: 1920x628px")
print("🎨 Colors: Orange gradient with terminal symbol")
