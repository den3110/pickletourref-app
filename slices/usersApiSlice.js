import { apiSlice } from "./apiSlice";
import { setCredentials } from "./authSlice";

const USERS_URL = "/api";

export const userApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/admin/login`,
        method: "POST",
        body: data,
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: `${USERS_URL}/users/logout`,
        method: "POST",
      }),
    }),
    register: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/users`,
        method: "POST",
        body: data,
      }),
    }),
    updateUser: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/users/profile`,
        method: "PUT",
        body: data,
      }),
    }),
    getPublicProfile: builder.query({
      query: (id) => `/api/users/${id}/public`,
    }),
    getRatingHistory: builder.query({
      query: (id) => `/api/users/${id}/ratings`,
    }),
    getMatchHistory: builder.query({
      query: (id) => `/api/users/${id}/matches`,
    }),
    getProfile: builder.query({
      query: () => "/api/users/profile",
      providesTags: ["User"],
      keepUnusedDataFor: 0,
      forceRefetch: () => true,
      async onQueryStarted(arg, { dispatch, getState, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const prev = getState().auth?.userInfo || {};
          const next = { ...prev, ...data };
          if (!data?.token && prev?.token) next.token = prev.token;
          dispatch(setCredentials(next));
        } catch {}
      },
    }),
    searchUser: builder.query({
      query: (q) => `/api/users/search?q=${encodeURIComponent(q)}`,
    }),
    // slices/usersApiSlice.ts
    deleteMe: builder.mutation({
      query: () => ({ url: "/api/users/me", method: "DELETE" }),
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
  useUpdateUserMutation,
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useLazySearchUserQuery,
  useDeleteMeMutation,

} = userApiSlice;
