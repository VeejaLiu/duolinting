from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from duolinting_video_generator.cli import main


if __name__ == "__main__":
    main()
