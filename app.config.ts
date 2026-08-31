export default defineAppConfig({
  nuxtIcon: {
    size: '24px',
  },
  ui: {
    button: {
      base: 'cursor-pointer',
      defaultVariants: {
        size: 'md',
      },
    },
    input: {
      slots: {
        root: 'w-full',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
      },
    },
    inputDate: {
      slots: {
        base: 'w-full',
      },
    },
    select: {
      slots: {
        base: 'w-full',
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full',
      },
    },
    inputMenu: {
      slots: {
        root: 'w-full',
      },
    },
  },
});
