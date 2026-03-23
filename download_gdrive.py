import gdown
import os
import shutil

print("Downloading folder...")
gdown.download_folder(id="15YCN3CYb97GyIoNUV6NJxGNIf-rUBFUJ", quiet=False, use_cookies=False)

# The folder downloaded might be named "Video Datasets" or something similar.
# Let's find the mp4 file and move it to sample_video.mp4
for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith(".mp4") and "sample_video" not in file:
            mp4_path = os.path.join(root, file)
            print(f"Found video: {mp4_path}")
            shutil.move(mp4_path, "sample_video.mp4")
            print("Moved to sample_video.mp4")
            break
