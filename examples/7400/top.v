module top(
    input  wire pd4, // a0,
    input  wire pd5, // b0,
    output wire pd6, // y0,
    input  wire pd7, // a1,
    input  wire pa1, // b1,
    output wire pa2, // y1,

    output wire pc2, // y2,
    input  wire pc3, // b2,
    input  wire pc4, // a2,
    output wire pc5, // y3,
    input  wire pc6, // b3,
    input  wire pc7  // a3
);

wire [3:0] a = {pc7, pc4, pd7, pd4};
wire [3:0] b = {pc6, pc3, pa1, pd5};
wire [3:0] y = ~(a & b);

assign {pc5, pc2, pa2, pd6} = y;

endmodule
