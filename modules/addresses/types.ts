export type AccountAddress = {
  id: number;
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  zipcode: string;
  baseAddress: string;
  detailAddress: string | null;
  isDefault: boolean;
  createdAt: string;
};
