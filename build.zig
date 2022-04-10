const std = @import("std");

pub fn build(b: *std.build.Builder) void {
    const target = b.standardTargetOptions(.{});
    const mode = b.standardReleaseOptions();
    const exe = b.addExecutable("quickjs", null);
    exe.setTarget(target);
    exe.setBuildMode(mode);
    exe.install();
    exe.linkLibC();
    exe.addCSourceFiles(&.{
        "quickjs/qjsc.c",
        "quickjs/quickjs.c",
        "quickjs/cutils.c",
        "quickjs/quickjs-libc.c",
        "quickjs/libbf.c",
        "quickjs/libregexp.c",
        "quickjs/libunicode.c",
    }, &.{
        "-DCONFIG_VERSION=\"2021-03-27\"",
        "-DCONFIG_BIGNUM",
    });
}
