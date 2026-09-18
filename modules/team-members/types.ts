export type TeamMember = {
  id: number;
  teamId: number;
  memberId: number;
  activeStartDate: string;
  activeEndDate: string | null;
  role: string | null;
  displayOrder: number | null;
  createdAt: string;
  updatedAt: string;
};
