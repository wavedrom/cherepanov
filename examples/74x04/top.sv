module top(
    input        [7:0] a,
    output logic [7:0] y
);

always_comb y = ~a;

endmodule
