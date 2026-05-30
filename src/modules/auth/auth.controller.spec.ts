import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    register: jest.fn(),
    registerDoctor: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('forwards register() to the service', async () => {
    service.register.mockResolvedValue({ access_token: 't' });
    const dto = {
      email: 'a@b.com',
      password: 'xxxxxxx',
      fullName: 'X',
      phone: '0',
    };
    await expect(controller.register(dto)).resolves.toEqual({
      access_token: 't',
    });
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('forwards login() to the service', async () => {
    service.login.mockResolvedValue({ access_token: 't' });
    const dto = { email: 'a@b.com', password: 'x' };
    await expect(controller.login(dto)).resolves.toEqual({ access_token: 't' });
  });

  it('forwards logout() with the user id from decorator', async () => {
    service.logout.mockResolvedValue({ message: 'bye' });
    await expect(controller.logout('user-1')).resolves.toEqual({
      message: 'bye',
    });
    expect(service.logout).toHaveBeenCalledWith('user-1');
  });

  it('forwards changePassword()', async () => {
    service.changePassword.mockResolvedValue({ message: 'ok' });
    const dto = { old_password: 'a', new_password: 'bbbbbbbb' };
    await controller.changePassword('user-1', dto);
    expect(service.changePassword).toHaveBeenCalledWith('user-1', dto);
  });

  it('forwards forgotPassword()', async () => {
    service.forgotPassword.mockResolvedValue({ message: 'sent' });
    const dto = { email: 'a@b.com' };
    await controller.forgotPassword(dto);
    expect(service.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('forwards resetPassword()', async () => {
    service.resetPassword.mockResolvedValue({ message: 'reset' });
    const dto = { token: 'a'.repeat(43), new_password: 'newSecret123' };
    await controller.resetPassword(dto);
    expect(service.resetPassword).toHaveBeenCalledWith(dto);
  });
});
