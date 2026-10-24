import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createUserSchema, type TemporaryPasswordResponse, type UserListItem } from '@tli/shared';
import { api, applyServerErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog, useRoles } from './api-hooks';

// El formulario usa '' para "sin valor" en los selects; se convierte a null al enviar.
const formSchema = createUserSchema.extend({
  defaultAreaId: z.string(),
  defaultWarehouseId: z.string(),
});
type Values = z.infer<typeof formSchema>;

export function UserFormDialog({
  user,
  onClose,
  onCreated,
}: {
  user: UserListItem | null;
  onClose: () => void;
  onCreated: (res: TemporaryPasswordResponse) => void;
}) {
  const qc = useQueryClient();
  const roles = useRoles();
  const areas = useCatalog('areas');
  const warehouses = useCatalog('warehouses');
  const [error, setError] = useState<string | null>(null);
  const isNew = user === null;

  const {
    register,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      defaultAreaId: user?.defaultArea?.id ?? '',
      defaultWarehouseId: user?.defaultWarehouse?.id ?? '',
      roleIds: user?.roles.map((r) => r.id) ?? [],
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const common = {
      fullName: v.fullName,
      defaultAreaId: v.defaultAreaId || null,
      defaultWarehouseId: v.defaultWarehouseId || null,
      roleIds: v.roleIds,
    };
    try {
      if (isNew) {
        const res = await api<TemporaryPasswordResponse>('/users', {
          method: 'POST',
          body: { ...common, email: v.email },
        });
        onCreated(res);
      } else {
        await api(`/users/${user.id}`, { method: 'PATCH', body: common });
      }
      await qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (e) {
      setError(applyServerErrors(e, setFieldError));
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Nuevo usuario' : 'Editar usuario'}
      description={
        isNew
          ? 'Se genera una contraseña temporal que la persona cambia al primer ingreso.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>
            {isNew ? 'Crear usuario' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" required error={errors.email?.message}>
          {(p) => <Input {...p} type="email" disabled={!isNew} {...register('email')} />}
        </Field>
        <Field label="Nombre y apellido" required error={errors.fullName?.message}>
          {(p) => <Input {...p} {...register('fullName')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área" error={errors.defaultAreaId?.message}>
            {(p) => (
              <Select {...p} {...register('defaultAreaId')}>
                <option value="">Sin área</option>
                {areas.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Depósito" error={errors.defaultWarehouseId?.message}>
            {(p) => (
              <Select {...p} {...register('defaultWarehouseId')}>
                <option value="">Sin depósito</option>
                {warehouses.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">
            Roles{' '}
            <span className="text-danger" aria-hidden>
              *
            </span>
          </legend>
          <Controller
            control={control}
            name="roleIds"
            render={({ field }) => (
              <div className="mt-2 space-y-2">
                {roles.data?.map((r) => (
                  <Checkbox
                    key={r.id}
                    checked={field.value.includes(r.id)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked
                          ? [...field.value, r.id]
                          : field.value.filter((id) => id !== r.id),
                      )
                    }
                    label={
                      <>
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-xs text-muted">{r.description}</span>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          />
          {errors.roleIds && <p className="mt-1 text-xs text-danger">{errors.roleIds.message}</p>}
        </fieldset>
      </form>
    </Dialog>
  );
}
