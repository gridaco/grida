#![cfg(target_os = "emscripten")]
#![allow(non_camel_case_types)]

//
// emscripten bindings
// references
// - https://github.com/ALEX11BR/emscripten-functions/tree/main/emscripten-functions-sys
//

pub type em_callback_func = ::std::option::Option<unsafe extern "C" fn()>;
pub type em_arg_callback_func =
    ::std::option::Option<unsafe extern "C" fn(arg1: *mut ::std::os::raw::c_void)>;
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

extern "C" {
    pub fn emscripten_get_now() -> f64;
}

extern "C" {
    pub fn emscripten_random() -> f32;
}

extern "C" {
    pub fn emscripten_get_device_pixel_ratio() -> f64;
}

unsafe extern "C" {
    pub fn emscripten_request_animation_frame_loop(
        cb: ::std::option::Option<
            unsafe extern "C" fn(time: f64, user_data: *mut ::std::os::raw::c_void) -> bool,
        >,
        user_data: *mut ::std::os::raw::c_void,
    );
}

extern "C" {
    pub fn emscripten_set_main_loop(
        func: em_callback_func,
        fps: ::std::os::raw::c_int,
        simulate_infinite_loop: bool,
    );
}
extern "C" {
    pub fn emscripten_set_main_loop_timing(
        mode: ::std::os::raw::c_int,
        value: ::std::os::raw::c_int,
    ) -> ::std::os::raw::c_int;
}
extern "C" {
    pub fn emscripten_get_main_loop_timing(
        mode: *mut ::std::os::raw::c_int,
        value: *mut ::std::os::raw::c_int,
    );
}
extern "C" {
    pub fn emscripten_set_main_loop_arg(
        func: em_arg_callback_func,
        arg: *mut ::std::os::raw::c_void,
        fps: ::std::os::raw::c_int,
        simulate_infinite_loop: bool,
    );
}
extern "C" {
    pub fn emscripten_pause_main_loop();
}
extern "C" {
    pub fn emscripten_resume_main_loop();
}
extern "C" {
    pub fn emscripten_cancel_main_loop();
}
