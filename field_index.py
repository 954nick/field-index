import tkinter as tk
from pathlib import Path

# Store application information
app_name = "Field Index"
version = 0.1

app_title = f"{app_name} v{version}"

# Define application colors
background_color = "#17191C"

# Create and configure the application window 
app = tk.Tk()
app.title(app_title)
app.geometry("1500x900")
app.configure(bg=background_color)

# Build paths to application assets
project_folder = Path(__file__).parent
logo_path = project_folder / "assets" / "field_index_logo.svg"

# Load and display the application logo
logo_image = tk.PhotoImage(
    file=logo_path,
    format="svg -scaletowidth 350"
    )
title_label = tk.Label(app, image=logo_image)
title_label.configure(bg=background_color)
title_label.pack()

# Start the Field Index application
app.mainloop()

