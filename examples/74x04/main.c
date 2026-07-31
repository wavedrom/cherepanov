#include "ch32fun.h"

// Auto-generated from module top by bin/cli.js. Do not edit by hand.
// Verilator --cc lowered the logic; the verilated C++ runtime
// is NOT used (it is hosted-only and will not build for rv32ec).
//
// Port / pin map:
//   a [8b] input -> PD4, PD6, PA1, PD0, PC2, PC4, PC6, PD3
//   y [8b] output -> PD5, PD7, PA2, PC0, PC1, PD2, PC5, PC3

static uint8_t port_a;
static uint8_t port_y;

static uint32_t pa_prev;
static uint32_t pc_prev;
static uint32_t pd_prev;

// Verilator-lowered logic (translated from
// Vtop___024root___ico_sequent__TOP__0).
static inline void eval(void) {
// Body
    port_y = (0xffU & (~ (uint32_t)(port_a)));
}

static void io_init(void) {
    funGpioInitAll();
    funPinMode(PD4, FUN_INPUT);
    funPinMode(PD6, FUN_INPUT);
    funPinMode(PA1, FUN_INPUT);
    funPinMode(PD0, FUN_INPUT);
    funPinMode(PC2, FUN_INPUT);
    funPinMode(PC4, FUN_INPUT);
    funPinMode(PC6, FUN_INPUT);
    funPinMode(PD3, FUN_INPUT);
    funPinMode(PD5, FUN_OUTPUT);
    funPinMode(PD7, FUN_OUTPUT);
    funPinMode(PA2, FUN_OUTPUT);
    funPinMode(PC0, FUN_OUTPUT);
    funPinMode(PC1, FUN_OUTPUT);
    funPinMode(PD2, FUN_OUTPUT);
    funPinMode(PC5, FUN_OUTPUT);
    funPinMode(PC3, FUN_OUTPUT);
}

int main(void) {
    SystemInit();
    io_init();
    while (1/*loop*/) {
        // read inputs
        uint32_t changed = 0;
        uint32_t indr_a = GPIOA->INDR;
        if (__builtin_expect(indr_a != pa_prev, 0)) {
            pa_prev = indr_a;
            changed = 1;
        }
        uint32_t indr_c = GPIOC->INDR;
        if (__builtin_expect(indr_c != pc_prev, 0)) {
            pc_prev = indr_c;
            changed = 1;
        }
        uint32_t indr_d = GPIOD->INDR;
        if (__builtin_expect(indr_d != pd_prev, 0)) {
            pd_prev = indr_d;
            changed = 1;
        }
        if (__builtin_expect(changed == 0, 1)) continue;
        port_a = 0
            | (uint8_t)(((indr_d >> 4U) & 1U) << 0U)
            | (uint8_t)(((indr_d >> 6U) & 1U) << 1U)
            | (uint8_t)(((indr_a >> 1U) & 1U) << 2U)
            | (uint8_t)(((indr_d >> 0U) & 1U) << 3U)
            | (uint8_t)(((indr_c >> 2U) & 1U) << 4U)
            | (uint8_t)(((indr_c >> 4U) & 1U) << 5U)
            | (uint8_t)(((indr_c >> 6U) & 1U) << 6U)
            | (uint8_t)(((indr_d >> 3U) & 1U) << 7U)
            ;
        // evaluate logic
        eval();
        // write outputs
        GPIOA->OUTDR = 0
            | ((uint32_t)((port_y >> 2U) & 1U) << 2U)
            ;
        GPIOC->OUTDR = 0
            | ((uint32_t)((port_y >> 3U) & 1U) << 0U)
            | ((uint32_t)((port_y >> 4U) & 1U) << 1U)
            | ((uint32_t)((port_y >> 6U) & 1U) << 5U)
            | ((uint32_t)((port_y >> 7U) & 1U) << 3U)
            ;
        GPIOD->OUTDR = 0
            | ((uint32_t)((port_y >> 0U) & 1U) << 5U)
            | ((uint32_t)((port_y >> 1U) & 1U) << 7U)
            | ((uint32_t)((port_y >> 5U) & 1U) << 2U)
            ;
    }
}
