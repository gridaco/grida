#![cfg(target_os = "emscripten")]

//
// emscripten bindings
// references
// - https://github.com/ALEX11BR/emscripten-functions/tree/main/emscripten-functions-sys
//

unsafe extern "C" {
    pub fn emscripten_GetProcAddress(
        name: *const ::std::os::raw::c_char,
    ) -> *const ::std::os::raw::c_void;
}

unsafe extern "C" {
    pub fn emscripten_request_animation_frame(
        cb: ::std::option::Option<
            unsafe extern "C" fn(time: f64, user_data: *mut ::std::os::raw::c_void) -> bool,
        >,
        user_data: *mut ::std::os::raw::c_void,
    ) -> ::std::os::raw::c_int;
}

unsafe extern "C" {
    pub fn emscripten_cancel_animation_frame(request_animation_frame_id: ::std::os::raw::c_int);
}

unsafe extern "C" {
    pub fn emscripten_request_animation_frame_loop(
        cb: ::std::option::Option<
            unsafe extern "C" fn(time: f64, user_data: *mut ::std::os::raw::c_void) -> bool,
        >,
        user_data: *mut ::std::os::raw::c_void,
    );
}
