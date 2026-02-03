export async function getCurrentUser() {
  // Placeholder for authentication
  // Replace with actual auth implementation
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  return user;
}
