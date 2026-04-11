from PIL import Image, ImageDraw

# Image dimensions
width, height = 64, 80
image = Image.new("RGBA", (width, height), (0, 0, 0, 0)) # Transparent background
draw = ImageDraw.Draw(image)

# Define GBA-like colors
COLOR_BRICK_LIGHT = (150, 75, 50, 255)  # Red-brown
COLOR_BRICK_DARK = (100, 50, 30, 255)   # Darker red-brown for shading/outline
COLOR_ROOF_MAIN = (50, 100, 150, 255)   # Blue
COLOR_ROOF_DARK = (30, 70, 100, 255)    # Darker blue
COLOR_WINDOW_GLASS = (150, 200, 220, 255) # Light blue
COLOR_WINDOW_FRAME = (50, 50, 50, 255)  # Dark grey
COLOR_DOOR_GLASS = (180, 220, 240, 255) # Lighter blue for door glass
COLOR_DOOR_FRAME = (70, 70, 70, 255)    # Grey for door frame
COLOR_SIGN_PLATE = (200, 200, 200, 255) # Light grey
COLOR_SIGN_OUTLINE = (100, 100, 100, 255) # Dark grey

# Building parameters
wall_height = 60
building_width = 50
building_start_x = (width - building_width) // 2
building_end_x = building_start_x + building_width
wall_top_y = height - wall_height
wall_bottom_y = height

# 1. Draw brick walls
# Main wall body (rectangle coordinates are inclusive of top-left, exclusive of bottom-right, when using fill, so adjust for outline)
draw.rectangle([(building_start_x, wall_top_y), (building_end_x -1, wall_bottom_y -1)], fill=COLOR_BRICK_LIGHT)
# Wall outline
draw.rectangle([(building_start_x, wall_top_y), (building_end_x -1, wall_bottom_y -1)], outline=COLOR_BRICK_DARK, width=1)
# Add some horizontal brick lines for texture
for y in range(wall_top_y + 3, wall_bottom_y - 2, 6):
    for x in range(building_start_x + 2, building_end_x - 1, 4):
        draw.line([(x, y), (x + 2, y)], fill=COLOR_BRICK_DARK, width=1)
for y in range(wall_top_y + 6, wall_bottom_y - 2, 6):
    for x in range(building_start_x + 4, building_end_x - 1, 4):
        draw.line([(x, y), (x + 2, y)], fill=COLOR_BRICK_DARK, width=1)


# 2. Draw roof
roof_base_y = wall_top_y - 1 # Roof starts 1 pixel above the wall outline
roof_overhang_width = 3
roof_start_x = building_start_x - roof_overhang_width
roof_end_x = building_end_x + roof_overhang_width
roof_height_actual = 18

# Base overhang layer
draw.rectangle([(roof_start_x, roof_base_y - 2), (roof_end_x -1, roof_base_y)], fill=COLOR_ROOF_MAIN)

# Sloped part of the roof (trapezoid, mimicking a peaked roof)
roof_peak_y = roof_base_y - roof_height_actual
draw.polygon([
    (roof_start_x, roof_base_y - 2),
    (roof_end_x, roof_base_y - 2),
    (roof_end_x - roof_overhang_width + 1, roof_peak_y),
    (roof_start_x + roof_overhang_width - 1, roof_peak_y)
], fill=COLOR_ROOF_MAIN)

# Roof outlines/shading
draw.line([(roof_start_x, roof_base_y - 2), (roof_end_x, roof_base_y - 2)], fill=COLOR_ROOF_DARK, width=1) # Bottom edge of sloped part
draw.line([(roof_start_x, roof_base_y - 2), (roof_start_x + roof_overhang_width - 1, roof_peak_y)], fill=COLOR_ROOF_DARK, width=1) # Left slope
draw.line([(roof_end_x, roof_base_y - 2), (roof_end_x - roof_overhang_width + 1, roof_peak_y)], fill=COLOR_ROOF_DARK, width=1) # Right slope
draw.line([(roof_start_x + roof_overhang_width - 1, roof_peak_y), (roof_end_x - roof_overhang_width + 1, roof_peak_y)], fill=COLOR_ROOF_DARK, width=1) # Top edge

# Add tile lines to the sloped part
for y_offset in range(3, roof_height_actual - 3, 4):
    # Calculate x-coordinates that correspond to the slope at this y_offset
    # This is a linear interpolation
    y_current = roof_base_y - 2 - y_offset
    # Ratio along the height from base to peak
    ratio = (roof_base_y - 2 - y_current) / (roof_height_actual - 2)
    current_left_x = int(roof_start_x + (roof_overhang_width - 1) * ratio)
    current_right_x = int(roof_end_x - (roof_overhang_width - 1) * ratio)
    draw.line([(current_left_x, y_current), (current_right_x, y_current)], fill=COLOR_ROOF_DARK, width=1)


# 3. Draw windows (4 windows, 2 per floor)
window_width = 10
window_height = 12
window_padding_x = 7 # Padding from building edge
# Floor 1 windows (upper floor)
window_y1 = wall_top_y + 8 # Top of wall + padding
window_x1_left = building_start_x + window_padding_x
window_x1_right = building_end_x - window_padding_x - window_width

# Floor 2 windows (lower floor)
window_y2 = wall_top_y + wall_height // 2 + 5 # Middle of wall + padding
window_x2_left = building_start_x + window_padding_x
window_x2_right = building_end_x - window_padding_x - window_width

windows_coords = [
    (window_x1_left, window_y1), (window_x1_right, window_y1),
    (window_x2_left, window_y2), (window_x2_right, window_y2)
]

for wx, wy in windows_coords:
    draw.rectangle([(wx, wy), (wx + window_width -1, wy + window_height -1)], fill=COLOR_WINDOW_GLASS)
    draw.rectangle([(wx, wy), (wx + window_width -1, wy + window_height -1)], outline=COLOR_WINDOW_FRAME, width=1)
    draw.line([(wx, wy + window_height // 2), (wx + window_width, wy + window_height // 2)], fill=COLOR_WINDOW_FRAME, width=1)
    draw.line([(wx + window_width // 2, wy), (wx + window_width // 2, wy + window_height)], fill=COLOR_WINDOW_FRAME, width=1)

# 4. Draw glass entrance door at center bottom
door_width = 16
door_height = 24
door_x = (width - door_width) // 2
door_y = wall_bottom_y - door_height - 1
draw.rectangle([(door_x, door_y), (door_x + door_width -1, door_y + door_height -1)], fill=COLOR_DOOR_GLASS)
draw.rectangle([(door_x, door_y), (door_x + door_width -1, door_y + door_height -1)], outline=COLOR_DOOR_FRAME, width=1)
draw.line([(door_x + door_width // 2, door_y), (door_x + door_width // 2, door_y + door_height)], fill=COLOR_DOOR_FRAME, width=1)
draw.point((door_x + door_width // 4, door_y + door_height // 2), fill=COLOR_DOOR_FRAME)
draw.point((door_x + door_width - door_width // 4 -1, door_y + door_height // 2), fill=COLOR_DOOR_FRAME)

# 5. Draw small company sign plate above the door
sign_width = 20
sign_height = 6
sign_x = (width - sign_width) // 2
sign_y = door_y - sign_height - 3
draw.rectangle([(sign_x, sign_y), (sign_x + sign_width -1, sign_y + sign_height -1)], fill=COLOR_SIGN_PLATE)
draw.rectangle([(sign_x, sign_y), (sign_x + sign_width -1, sign_y + sign_height -1)], outline=COLOR_SIGN_OUTLINE, width=1)

# 6. Apply additional shading for depth (simple drop shadows/darker lines)
# This adds a small shadow line directly under the roof overhang
draw.line([(roof_start_x, roof_base_y), (roof_end_x, roof_base_y)], fill=COLOR_BRICK_DARK, width=1)

# Save the image
output_path = "/tmp/pokemon_hq.png"
image.save(output_path)
print(f"Image saved to {output_path}")
