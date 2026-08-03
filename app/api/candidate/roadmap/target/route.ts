import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { profileSnapshot } from "@/lib/profile-snapshot";
import { enqueueRecompute } from "@/lib/recompute";
const schema=z.object({targetOccupationId:z.string().min(1)});
export async function PATCH(request:NextRequest){try{const input=schema.parse(await request.json());const{profile}=await getDemoCandidate();const nextVersion=profile.profileVersion+1;await db.$transaction(async tx=>{await tx.profileRevision.create({data:{candidateProfileId:profile.id,version:profile.profileVersion,source:"TARGET_CHANGE",snapshot:profileSnapshot(profile)}});await tx.candidateProfile.update({where:{id:profile.id},data:{selectedTargetOccupationId:input.targetOccupationId,profileVersion:nextVersion}})});const task=await enqueueRecompute(profile.id,nextVersion);return NextResponse.json({data:{task},errors:[],requestId:crypto.randomUUID()});}catch(error){return NextResponse.json({data:null,errors:[{code:"TARGET_UPDATE_FAILED",message:error instanceof Error?error.message:String(error)}],requestId:crypto.randomUUID()},{status:400})}}
