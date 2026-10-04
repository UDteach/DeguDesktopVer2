"""Read-only Win32 style/hit testing for our overlay; never move the cursor."""
import ctypes
from ctypes import wintypes
import json
import sys
user32 = ctypes.WinDLL('user32', use_last_error=True)
get_style = user32.GetWindowLongPtrW
get_style.argtypes = [wintypes.HWND, ctypes.c_int]
get_style.restype = ctypes.c_ssize_t
user32.WindowFromPoint.argtypes = [wintypes.POINT]
user32.WindowFromPoint.restype = wintypes.HWND
hwnd = int(sys.argv[1], 16)
style = get_style(hwnd, -20)
point = wintypes.POINT(int(sys.argv[2]), int(sys.argv[3]))
hit = user32.WindowFromPoint(point)
print(json.dumps({'transparent': bool(style & 0x20), 'layered': bool(style & 0x80000), 'noActivate': bool(style & 0x8000000), 'hitOwnOverlay': hit == hwnd, 'extendedStyle': hex(style)}))
