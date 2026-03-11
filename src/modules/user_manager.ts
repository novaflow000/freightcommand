import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  lastLogin?: string;
}

export class UserManager {
  private usersPath: string;
  private users: User[] = [];

  constructor() {
    this.usersPath = path.join(process.cwd(), 'data', 'users.json');
    this.initialize();
  }

  private initialize() {
    if (!fs.existsSync(this.usersPath)) {
      this.createDefaultUsers();
    } else {
      this.loadUsers();
    }
  }

  private createDefaultUsers() {
    const defaultUsers: User[] = [
      {
        id: '1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        lastLogin: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Operator',
        email: 'ops@example.com',
        role: 'user',
        status: 'active',
      },
    ];
    this.users = defaultUsers;
    this.saveUsers();
  }

  private loadUsers() {
    try {
      const content = fs.readFileSync(this.usersPath, 'utf-8');
      this.users = JSON.parse(content);
    } catch (error) {
      console.error('Error loading users:', error);
      this.users = [];
    }
  }

  private saveUsers() {
    try {
      const dir = path.dirname(this.usersPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
    } catch (error) {
      console.error('Error saving users:', error);
    }
  }

  public getAllUsers(): User[] {
    return this.users;
  }

  public addUser(user: Omit<User, 'id'>): User {
    const newUser: User = {
      ...user,
      id: Math.random().toString(36).substr(2, 9),
    };
    this.users.push(newUser);
    this.saveUsers();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return undefined;

    this.users[index] = { ...this.users[index], ...updates };
    this.saveUsers();
    return this.users[index];
  }

  public deleteUser(id: string): boolean {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return false;

    this.users.splice(index, 1);
    this.saveUsers();
    return true;
  }
}
