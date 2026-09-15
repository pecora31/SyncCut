//! Closing the app's last job handle also kills the worker after an app crash.
//! The worker receives no inheritable handle to this job object.
#[cfg(windows)]
pub fn attach(child: &std::process::Child) -> Result<std::os::windows::io::OwnedHandle, String> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::JobObjects::*;
    unsafe {
        let raw = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if raw.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let job = OwnedHandle::from_raw_handle(raw);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            raw,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const std::ffi::c_void,
            std::mem::size_of_val(&limits) as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        if AssignProcessToJobObject(raw, child.as_raw_handle()) == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(job)
    }
}

#[cfg(not(windows))]
pub fn attach(_child: &std::process::Child) -> Result<(), String> {
    Ok(())
}
