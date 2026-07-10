/** Holder del token JWT, leído por el interceptor del bffClient. */
let _token: string | null = null;

export const setAuthToken = (t: string | null) => {
  _token = t;
};
export const getAuthToken = () => _token;
