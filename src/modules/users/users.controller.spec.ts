import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  const svc = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest
      .fn()
      .mockResolvedValue({ id: '1', email: 'test@example.com' }),
    update: jest.fn().mockResolvedValue({ id: '1' }),
    remove: jest
      .fn()
      .mockResolvedValue({ message: 'User deactivated successfully' }),
    updateProfile: jest.fn(),
    updateDoctorDetails: jest.fn(),
    updatePatientDetails: jest.fn(),
    getAllDoctors: jest.fn(),
    getAllPatients: jest.fn(),
    getSpecializations: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: svc }],
    }).compile();
    controller = module.get(UsersController);
  });

  it('findAll delegates', async () => {
    await controller.findAll();
    expect(svc.findAll).toHaveBeenCalled();
  });

  it('remove returns deactivation message', async () => {
    const res = await controller.remove('1');
    expect(res.message).toMatch(/deactivated/i);
  });
});
