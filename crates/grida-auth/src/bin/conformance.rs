fn main() {
    if grida_auth::conformance::run().is_err() {
        println!("{{\"ok\":false,\"code\":\"driver_failed\"}}");
        std::process::exit(1);
    }
}
