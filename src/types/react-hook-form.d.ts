declare module 'react-hook-form' {
  export type FieldValues = Record<string, unknown>;

  export type FieldPath<
    TFieldValues extends FieldValues = FieldValues
  > = Extract<keyof TFieldValues, string>;

  export type ControllerRenderProps<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  > = {
    field: {
      name: TName;
      value: unknown;
      onChange: (...event: unknown[]) => void;
      onBlur: () => void;
      ref: import('react').Ref<unknown>;
    };
    fieldState: unknown;
    formState: unknown;
  };

  export type ControllerProps<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  > = {
    name: TName;
    render: (props: ControllerRenderProps<TFieldValues, TName>) => import('react').ReactElement | null;
  } & Record<string, unknown>;

  export type FieldState = {
    error?: { message?: string } | undefined;
  } & Record<string, unknown>;

  export const Controller: <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  >(
    props: ControllerProps<TFieldValues, TName>
  ) => import('react').ReactElement | null;

  export type UseFormReturn<TFieldValues extends FieldValues = FieldValues> = {
    getFieldState: (name: FieldPath<TFieldValues>, formState: unknown) => FieldState;
    formState: unknown;
  };

  export function useFormContext<TFieldValues extends FieldValues = FieldValues>(): UseFormReturn<TFieldValues>;

  export const FormProvider: import('react').ComponentType<{
    children?: import('react').ReactNode;
  } & Record<string, unknown>>;
}
