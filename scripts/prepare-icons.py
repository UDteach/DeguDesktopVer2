"""Build application/tray icons from one unchanged MofuMouse PNG."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
image = Image.open(root / 'app/media/degu-agouti/walk/96-008.png').convert('RGBA')
bbox = image.getbbox()
image = image.crop(bbox)
canvas = Image.new('RGBA', (256, 256))
image.thumbnail((240, 216), Image.Resampling.LANCZOS)
canvas.alpha_composite(image, ((256 - image.width) // 2, (256 - image.height) // 2))
canvas.save(root / 'app/icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
canvas.resize((32, 32), Image.Resampling.LANCZOS).save(root / 'app/tray.png')
print('Application and tray icons prepared from the original agouti frame.')
