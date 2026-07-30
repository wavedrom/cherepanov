module ic_74x47 (
    input      [3:0] bcd,    // BCD data input [D, C, B, A]
    input            lt_n,   // Lamp Test (active LOW): turns on all segments
    input            rbi_n,  // Ripple Blanking Input (active LOW): suppresses leading zeros
    input            bi_n,   // Blanking Input (active LOW): forces all outputs OFF
    output           rbo_n,  // Ripple Blanking Output (active LOW)
    output reg [6:0] seg_n   // Segment outputs [g, f, e, d, c, b, a] (active LOW)
);

    // Ripple Blanking Output (RBO) logic:
    // Driven LOW during forced blanking (BI=0) or when BCD=0 while RBI=0
    assign rbo_n = bi_n && !(rbi_n == 1'b0 && bcd == 4'b0000);

    // Combinational decoding logic
    always @(*) begin
        if (!bi_n) begin
            // 1. Forced display blanking (highest priority)
            seg_n = 7'b111_1111;
        end 
        else if (!lt_n) begin
            // 2. Lamp Test mode — force all segments ON
            seg_n = 7'b000_0000;
        end 
        else if (!rbi_n && (bcd == 4'b0000)) begin
            // 3. Leading zero suppression — turn display OFF if input is zero
            seg_n = 7'b111_1111;
        end 
        else begin
            // 4. Standard 7447 decoding truth table (0 = Segment ON, 1 = Segment OFF)
            // Segment bit mapping: {g, f, e, d, c, b, a}
            case (bcd)
                4'h0: seg_n = 7'b100_0000; // 0
                4'h1: seg_n = 7'b111_1001; // 1
                4'h2: seg_n = 7'b010_0100; // 2
                4'h3: seg_n = 7'b011_0000; // 3
                4'h4: seg_n = 7'b001_1001; // 4
                4'h5: seg_n = 7'b001_0010; // 5
                4'h6: seg_n = 7'b000_0000; // 6 (includes top segment 'a' per 7447 spec)
                4'h7: seg_n = 7'b111_0000; // 7
                4'h8: seg_n = 7'b000_0000; // 8
                4'h9: seg_n = 7'b001_0000; // 9
                // Standard 7447 non-digit symbols for values 10 to 15:
                4'hA: seg_n = 7'b000_1000; // [
                4'hB: seg_n = 7'b000_0011; // ]
                4'hC: seg_n = 7'b001_1100; // u
                4'hD: seg_n = 7'b010_0001; // 
                4'hE: seg_n = 7'b000_0110; // 
                4'hF: seg_n = 7'b111_1111; // Blank
                default: seg_n = 7'b111_1111;
            endcase
        end
    end

endmodule
