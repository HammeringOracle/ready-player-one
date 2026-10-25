fn main() {
    if cfg!(target_os = "windows") {
        let mut resource = winres::WindowsResource::new();
        resource.set_icon("icon.ico");
        resource.set("ProductName", "Dual Boot Undo");
        resource.set("FileDescription", "Ready Player One Dual Boot Undo");
        resource.set("ProductVersion", "1.0.0");
        resource.compile().expect("could not compile Dual Boot Undo resources");
    }
}
