const std = @import("std");

fn S(comptime a: bool) type {
    return struct {
        const b = a;
        var x: u32 = 0;

        y: u32 = 0,

        fn foo(this: @This()) u32 {
            return this.y;
        }
    };
}

const S1 = S(false);
const S2 = S(true);

pub fn main() void {
    S1.x = 1;

    const x: u32 = 2;

    const SL = struct {
        foo: u32 = 0,
        test "foo" {
            std.testing.expectEqual(x, 3);
        }
    };

    const sl = SL{};
    _ = sl;

    var s1a = S1{ .y = 1 };
    var s1b = S1{ .y = x };

    std.log.warn(
        "{d} {d} {d} {d}",
        .{ S1.x, S2.x, S1.foo(s1a), S1.foo(s1b) },
    );
}
