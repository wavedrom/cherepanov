#include "ch32fun.h"

// Auto-generated from module ic_74x47 by bin/cli.js. Do not edit by hand.
// Verilator --cc lowered the logic; the verilated C++ runtime
// is NOT used (it is hosted-only and will not build for rv32ec).
//
// Port / pin map:
//   bcd [4b] input -> PD0, PD1, PD2, PD3
//   lt_n [1b] input -> PD4
//   rbi_n [1b] input -> PD5
//   bi_n [1b] input -> PD6
//   rbo_n [1b] output -> PC7
//   seg_n [7b] output -> PC0, PC1, PC2, PC3, PC4, PC5, PC6

static uint8_t port_bcd;
static uint8_t port_lt_n;
static uint8_t port_rbi_n;
static uint8_t port_bi_n;
static uint8_t port_rbo_n;
static uint8_t port_seg_n;

static uint32_t pd_prev;

static const uint8_t Vic_74x47__ConstPool__TABLE_h6c3f4e05_0[128] = { 0x7fU, 0x00U, 0x7fU, 0x7fU, 0x7fU, 0x00U, 0x7fU, 0x40U,
    0x7fU, 0x00U, 0x7fU, 0x79U, 0x7fU, 0x00U, 0x7fU, 0x79U,
    0x7fU, 0x00U, 0x7fU, 0x24U, 0x7fU, 0x00U, 0x7fU, 0x24U,
    0x7fU, 0x00U, 0x7fU, 0x30U, 0x7fU, 0x00U, 0x7fU, 0x30U,
    0x7fU, 0x00U, 0x7fU, 0x19U, 0x7fU, 0x00U, 0x7fU, 0x19U,
    0x7fU, 0x00U, 0x7fU, 0x12U, 0x7fU, 0x00U, 0x7fU, 0x12U,
    0x7fU, 0x00U, 0x7fU, 0x00U, 0x7fU, 0x00U, 0x7fU, 0x00U,
    0x7fU, 0x00U, 0x7fU, 0x70U, 0x7fU, 0x00U, 0x7fU, 0x70U,
    0x7fU, 0x00U, 0x7fU, 0x00U, 0x7fU, 0x00U, 0x7fU, 0x00U,
    0x7fU, 0x00U, 0x7fU, 0x10U, 0x7fU, 0x00U, 0x7fU, 0x10U,
    0x7fU, 0x00U, 0x7fU, 0x08U, 0x7fU, 0x00U, 0x7fU, 0x08U,
    0x7fU, 0x00U, 0x7fU, 0x03U, 0x7fU, 0x00U, 0x7fU, 0x03U,
    0x7fU, 0x00U, 0x7fU, 0x1cU, 0x7fU, 0x00U, 0x7fU, 0x1cU,
    0x7fU, 0x00U, 0x7fU, 0x21U, 0x7fU, 0x00U, 0x7fU, 0x21U,
    0x7fU, 0x00U, 0x7fU, 0x06U, 0x7fU, 0x00U, 0x7fU, 0x06U,
    0x7fU, 0x00U, 0x7fU, 0x7fU, 0x7fU, 0x00U, 0x7fU, 0x7fU };

// Verilator-lowered logic (translated from
// Vic_74x47___024root___ico_sequent__TOP__0).
static inline void eval(void) {
// Init
    uint8_t/*6:0*/ __Vtableidx1;
    __Vtableidx1 = 0;
    // Body
    port_rbo_n = ((~ ((~ (uint32_t)(port_rbi_n)) 
                           & (0U == (uint32_t)(port_bcd)))) 
                       & (uint32_t)(port_bi_n));
    __Vtableidx1 = (((uint32_t)(port_bcd) << 3U) 
                    | (((uint32_t)(port_rbi_n) << 2U) 
                       | (((uint32_t)(port_lt_n) 
                           << 1U) | (uint32_t)(port_bi_n))));
    port_seg_n = Vic_74x47__ConstPool__TABLE_h6c3f4e05_0
        [__Vtableidx1];
}

static void io_init(void) {
    funGpioInitAll();
    funPinMode(PD0, FUN_INPUT);
    funPinMode(PD1, FUN_INPUT);
    funPinMode(PD2, FUN_INPUT);
    funPinMode(PD3, FUN_INPUT);
    funPinMode(PD4, FUN_INPUT);
    funPinMode(PD5, FUN_INPUT);
    funPinMode(PD6, FUN_INPUT);
    funPinMode(PC7, FUN_OUTPUT);
    funPinMode(PC0, FUN_OUTPUT);
    funPinMode(PC1, FUN_OUTPUT);
    funPinMode(PC2, FUN_OUTPUT);
    funPinMode(PC3, FUN_OUTPUT);
    funPinMode(PC4, FUN_OUTPUT);
    funPinMode(PC5, FUN_OUTPUT);
    funPinMode(PC6, FUN_OUTPUT);
}

int main(void) {
    SystemInit();
    io_init();
    while (1/*loop*/) {
        // read inputs
        uint32_t changed = 0;
        uint32_t indr_d = GPIOD->INDR;
        if (__builtin_expect(indr_d != pd_prev, 0)) {
            pd_prev = indr_d;
            changed = 1;
        }
        if (__builtin_expect(changed == 0, 1)) continue;
        port_bcd = 0
            | (uint8_t)(((indr_d >> 0U) & 1U) << 0U)
            | (uint8_t)(((indr_d >> 1U) & 1U) << 1U)
            | (uint8_t)(((indr_d >> 2U) & 1U) << 2U)
            | (uint8_t)(((indr_d >> 3U) & 1U) << 3U)
            ;
        port_lt_n = 0
            | (uint8_t)(((indr_d >> 4U) & 1U) << 0U)
            ;
        port_rbi_n = 0
            | (uint8_t)(((indr_d >> 5U) & 1U) << 0U)
            ;
        port_bi_n = 0
            | (uint8_t)(((indr_d >> 6U) & 1U) << 0U)
            ;
        // evaluate logic
        eval();
        // write outputs
        GPIOC->OUTDR = 0
            | ((uint32_t)((port_rbo_n >> 0U) & 1U) << 7U)
            | ((uint32_t)((port_seg_n >> 0U) & 1U) << 0U)
            | ((uint32_t)((port_seg_n >> 1U) & 1U) << 1U)
            | ((uint32_t)((port_seg_n >> 2U) & 1U) << 2U)
            | ((uint32_t)((port_seg_n >> 3U) & 1U) << 3U)
            | ((uint32_t)((port_seg_n >> 4U) & 1U) << 4U)
            | ((uint32_t)((port_seg_n >> 5U) & 1U) << 5U)
            | ((uint32_t)((port_seg_n >> 6U) & 1U) << 6U)
            ;
    }
}
