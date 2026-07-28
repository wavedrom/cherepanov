module top(
    input        [5:0] a,
    output logic [5:0] y
);

always_comb y = ~a;

endmodule
