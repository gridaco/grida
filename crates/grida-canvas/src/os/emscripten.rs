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
            unsafe extern "C" fn(time: f64, userData: *mut ::std::os::raw::c_void) -> bool,
        >,
        userData: *mut ::std::os::raw::c_void,
    ) -> ::std::os::raw::c_int;
}

unsafe extern "C" {
    pub fn emscripten_cancel_animation_frame(requestAnimationFrameId: ::std::os::raw::c_int);
}

unsafe extern "C" {
    pub fn emscripten_request_animation_frame_loop(
        cb: ::std::option::Option<
            unsafe extern "C" fn(time: f64, userData: *mut ::std::os::raw::c_void) -> bool,
        >,
        userData: *mut ::std::os::raw::c_void,
    );
}
