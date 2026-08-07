fn main() {
    if std::env::var("PROFILE").as_deref() == Ok("release")
        && std::env::var("AWAI_SUB2API_BASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_none()
    {
        panic!("正式桌面构建必须设置 AWAI_SUB2API_BASE_URL");
    }
    tauri_build::build()
}
