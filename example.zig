const std = @import("std");

pub fn main() void {
    foo(1, 2);
}

fn foo(x: u32, y: u32) (void{}) {
    return x;
}
