export default defineAppConfig({
  ui: {
    colors: {
      primary: 'accent',
      neutral: 'zinc',
    },
    button: {
      slots: {
        base: 'rounded-xl font-medium transition-colors shadow-none',
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'bg-text-primary text-base hover:opacity-90 active:opacity-85 disabled:opacity-40 font-semibold',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class:
            'bg-surface text-text-primary ring-1 ring-inset ring-stroke hover:bg-surface-elevated',
        },
        {
          color: 'neutral',
          variant: 'subtle',
          class:
            'bg-surface-elevated text-text-primary hover:opacity-90',
        },
      ],
    },
    modal: {
      slots: {
        content: 'bg-surface ring-1 ring-stroke rounded-2xl shadow-none',
        header: 'border-b border-stroke',
        footer: 'border-t border-stroke',
      },
    },
    select: {
      slots: {
        base: 'bg-base text-text-primary ring-1 ring-stroke shadow-none',
        content: 'bg-surface ring-1 ring-stroke shadow-none',
        item: 'text-text-primary data-highlighted:before:bg-surface-elevated',
      },
    },
    inputNumber: {
      slots: {
        increment: 'text-accent',
        decrement: 'text-accent',
      },
    },
    popover: {
      slots: {
        content: 'bg-surface ring-1 ring-stroke shadow-none',
      },
    },
    calendar: {
      slots: {
        root: 'bg-surface text-text-primary',
        headCell: 'text-text-dim',
        cellTrigger: 'data-selected:bg-accent data-selected:text-base data-today:text-accent',
      },
    },
  },
});
