const std = @import("std");

fn foo(x: *const *u32) u32 {
    _ = x;
}

f1: u32 = 1,
f2: u32 = 0,

const c1 = c2;
const c2 = v1;

var v1: u32 = v2;
var v2: u32 = @compileError("x");

const S1 = struct {
    var s1v: u32 = 0;

    s1f: u32 = 0,

    const S2 = struct {
        var s2v = s1v;
    };
};

pub fn main() void {
    var x = S1{};
    var y = @This(){};
    _ = x;
    _ = y;
    _ = c1;
}
