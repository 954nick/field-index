import tkinter as tk
from pathlib import Path
from tkinter import filedialog 

# Store application information
app_name = "Field Index"
version = "0.3.3"

app_title = f"{app_name} v{version}"

# Define application colors
background_color = "#17191C"
primary_color = "#42E478"
error_color = "#FF0000"

# Select a CFB27 Dynasty save file
def select_save_file():
    selected_file = filedialog.askopenfilename(
        title="Please select a Dynasty save file!"
    )
    if selected_file:
        print(selected_file)
        dynasty_file_name = Path(selected_file).name

        # Read the selected save-file header
        with open(selected_file, "rb") as opened_save_file:
            save_header = opened_save_file.read(8)
            print(save_header)
            if save_header == b"FBCHUNKS":
                print("Valid CFB27 save")
                save_status_label.configure(text=dynasty_file_name, fg=primary_color)
            else: 
                print("Invalid file type")
                save_status_label.configure(text="Invalid file type",
                fg=error_color
                )

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

# Create and place the save-file selection controls
select_file_button = tk.Button(
    app,
    text="Select Dynasty Save",
    command=select_save_file
)
select_file_button.pack(pady=20)

save_status_label = tk.Label(app,
    text="No save file selected")
save_status_label.configure(bg=background_color, fg=primary_color)
save_status_label.pack(pady=20)

# Start the Field Index application
app.mainloop()
