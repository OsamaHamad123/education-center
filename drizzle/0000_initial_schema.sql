CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'archive', 'restore', 'transfer', 'login', 'lookup');--> statement-breakpoint
CREATE TYPE "public"."enrollment_end" AS ENUM('class_change', 'branch_transfer', 'archived');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."track" AS ENUM('scientific', 'literary');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'branch_admin', 'teacher');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_unique" UNIQUE("name"),
	CONSTRAINT "branches_code_unique" UNIQUE("code"),
	CONSTRAINT "branches_code_format" CHECK ("branches"."code" ~ '^[A-Z]{2,5}$')
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"role" "user_role" NOT NULL,
	"branch_id" uuid,
	"teacher_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_role_scope" CHECK (("user"."role" = 'branch_admin' and "user"."branch_id" is not null and "user"."teacher_id" is null)
       or ("user"."role" = 'super_admin'  and "user"."branch_id" is null     and "user"."teacher_id" is null)
       or ("user"."role" = 'teacher'      and "user"."branch_id" is null     and "user"."teacher_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"track" "track" NOT NULL,
	"gender" "gender" NOT NULL,
	"grade_level" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_branch_name_unique" UNIQUE("branch_id","name")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "teacher_branches" (
	"teacher_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_branches_teacher_id_branch_id_pk" PRIMARY KEY("teacher_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_rate_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"rate_scientific_piasters" integer NOT NULL,
	"rate_literary_piasters" integer NOT NULL,
	"effective_from" date NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"specialization" text,
	"rate_scientific_piasters" integer NOT NULL,
	"rate_literary_piasters" integer NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "teachers_rates_non_negative" CHECK ("teachers"."rate_scientific_piasters" >= 0 and "teachers"."rate_literary_piasters" >= 0),
	CONSTRAINT "teachers_phone_e164" CHECK ("teachers"."phone" ~ '^\+201[0125][0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "student_code_counters" (
	"branch_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "student_code_counters_branch_id_year_pk" PRIMARY KEY("branch_id","year")
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"end_reason" "enrollment_end",
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_enrollments_closed_has_reason" CHECK (("student_enrollments"."end_date" is null and "student_enrollments"."end_reason" is null)
       or ("student_enrollments"."end_date" is not null and "student_enrollments"."end_reason" is not null)),
	CONSTRAINT "student_enrollments_dates_ordered" CHECK ("student_enrollments"."end_date" is null or "student_enrollments"."end_date" >= "student_enrollments"."start_date")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_code" text NOT NULL,
	"full_name" text NOT NULL,
	"student_phone" text,
	"student_whatsapp" text,
	"parent_phone" text NOT NULL,
	"parent_whatsapp" text,
	"parent_phone_last4" text GENERATED ALWAYS AS (right(parent_phone, 4)) STORED,
	"national_id" text,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"join_date" date NOT NULL,
	"left_date" date,
	"leave_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_studentCode_unique" UNIQUE("student_code"),
	CONSTRAINT "students_archived_has_reason" CHECK (("students"."status" = 'active' and "students"."left_date" is null and "students"."leave_reason" is null)
       or ("students"."status" = 'archived' and "students"."left_date" is not null and "students"."leave_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "branch_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_id" uuid NOT NULL,
	"after_period" smallint NOT NULL,
	"duration_min" integer NOT NULL,
	"label" text,
	CONSTRAINT "branch_breaks_settings_after_period_unique" UNIQUE("settings_id","after_period"),
	CONSTRAINT "branch_breaks_after_period" CHECK ("branch_breaks"."after_period" between 1 and 12),
	CONSTRAINT "branch_breaks_duration" CHECK ("branch_breaks"."duration_min" between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "branch_schedule_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"track" "track" NOT NULL,
	"day_start_time" time NOT NULL,
	"period_duration_min" integer NOT NULL,
	"periods_count" integer NOT NULL,
	"working_days" smallint[] DEFAULT '{6,7,1,2,3,4}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_schedule_settings_branch_track_unique" UNIQUE("branch_id","track"),
	CONSTRAINT "branch_schedule_period_duration" CHECK ("branch_schedule_settings"."period_duration_min" between 20 and 180),
	CONSTRAINT "branch_schedule_periods_count" CHECK ("branch_schedule_settings"."periods_count" between 1 and 12),
	CONSTRAINT "branch_schedule_working_days_iso" CHECK (array_length("branch_schedule_settings"."working_days", 1) between 1 and 7
       and "branch_schedule_settings"."working_days" <@ array[1,2,3,4,5,6,7]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"period_number" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_slots_day_of_week" CHECK ("timetable_slots"."day_of_week" between 1 and 7),
	CONSTRAINT "timetable_slots_period_number" CHECK ("timetable_slots"."period_number" >= 1),
	CONSTRAINT "timetable_slots_times_ordered" CHECK ("timetable_slots"."end_time" > "timetable_slots"."start_time")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"notes" text,
	"marked_by" text,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_session_student_unique" UNIQUE("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"timetable_slot_id" uuid,
	"subject_name" text NOT NULL,
	"session_date" date NOT NULL,
	"period_number" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"track_applied" "track" NOT NULL,
	"rate_applied_piasters" integer NOT NULL,
	"status" "session_status" DEFAULT 'completed' NOT NULL,
	"cancel_reason" text,
	"is_extra" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_sessions_class_date_period_unique" UNIQUE("class_id","session_date","period_number"),
	CONSTRAINT "class_sessions_rate_non_negative" CHECK ("class_sessions"."rate_applied_piasters" >= 0),
	CONSTRAINT "class_sessions_times_ordered" CHECK ("class_sessions"."end_time" > "class_sessions"."start_time"),
	CONSTRAINT "class_sessions_cancelled_has_reason" CHECK (("class_sessions"."status" = 'completed' and "class_sessions"."cancel_reason" is null)
       or ("class_sessions"."status" = 'cancelled' and "class_sessions"."cancel_reason" is not null)),
	CONSTRAINT "class_sessions_extra_has_no_slot" CHECK (not "class_sessions"."is_extra" or "class_sessions"."timetable_slot_id" is null)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid,
	"user_id" text,
	"action" "audit_action" NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "center_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"center_name" text NOT NULL,
	"logo_path" text,
	"primary_color" text,
	"lookup_enabled" boolean DEFAULT true NOT NULL,
	"teacher_can_mark_attendance" boolean DEFAULT true NOT NULL,
	"attendance_edit_window_days" integer DEFAULT 7 NOT NULL,
	"absence_alert_threshold_percent" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "center_settings_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "center_settings_singleton" CHECK ("center_settings"."singleton"),
	CONSTRAINT "center_settings_edit_window" CHECK ("center_settings"."attendance_edit_window_days" between 0 and 365),
	CONSTRAINT "center_settings_absence_threshold" CHECK ("center_settings"."absence_alert_threshold_percent" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "lookup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"student_code" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_branches" ADD CONSTRAINT "teacher_branches_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_branches" ADD CONSTRAINT "teacher_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_rate_history" ADD CONSTRAINT "teacher_rate_history_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_code_counters" ADD CONSTRAINT "student_code_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_breaks" ADD CONSTRAINT "branch_breaks_settings_id_branch_schedule_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."branch_schedule_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_schedule_settings" ADD CONSTRAINT "branch_schedule_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_timetable_slot_id_timetable_slots_id_fk" FOREIGN KEY ("timetable_slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_is_active_idx" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_branch_idx" ON "user" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "user_teacher_idx" ON "user" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "classes_branch_active_idx" ON "classes" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE INDEX "subjects_is_active_idx" ON "subjects" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "teacher_branches_branch_idx" ON "teacher_branches" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE INDEX "teacher_rate_history_teacher_idx" ON "teacher_rate_history" USING btree ("teacher_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "teachers_status_idx" ON "teachers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "teachers_full_name_trgm_idx" ON "teachers" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "student_enrollments_one_open" ON "student_enrollments" USING btree ("student_id") WHERE end_date is null;--> statement-breakpoint
CREATE INDEX "student_enrollments_student_idx" ON "student_enrollments" USING btree ("student_id","start_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "student_enrollments_branch_idx" ON "student_enrollments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "student_enrollments_class_idx" ON "student_enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "students_branch_status_idx" ON "students" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "students_class_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "students_parent_phone_idx" ON "students" USING btree ("parent_phone");--> statement-breakpoint
CREATE INDEX "students_parent_last4_idx" ON "students" USING btree ("parent_phone_last4");--> statement-breakpoint
CREATE INDEX "students_full_name_trgm_idx" ON "students" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "students_national_id_unique" ON "students" USING btree ("national_id") WHERE national_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_slots_class_day_period_unique" ON "timetable_slots" USING btree ("class_id","day_of_week","period_number") WHERE is_active;--> statement-breakpoint
CREATE INDEX "timetable_slots_teacher_day_idx" ON "timetable_slots" USING btree ("teacher_id","day_of_week");--> statement-breakpoint
CREATE INDEX "timetable_slots_branch_idx" ON "timetable_slots" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_branch_status_idx" ON "attendance_records" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "attendance_records_session_idx" ON "attendance_records" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "class_sessions_teacher_date_idx" ON "class_sessions" USING btree ("teacher_id","session_date");--> statement-breakpoint
CREATE INDEX "class_sessions_branch_date_idx" ON "class_sessions" USING btree ("branch_id","session_date");--> statement-breakpoint
CREATE INDEX "class_sessions_status_idx" ON "class_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_branch_created_idx" ON "audit_logs" USING btree ("branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lookup_attempts_ip_created_idx" ON "lookup_attempts" USING btree ("ip_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lookup_attempts_code_created_idx" ON "lookup_attempts" USING btree ("student_code","created_at" DESC NULLS LAST);